package com.kafka.backend.lifecategory;

import com.kafka.backend.common.*;
import com.kafka.backend.lifetime.LifeTimeEntryRepository;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRepository;
import org.junit.jupiter.api.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class LifeCategoryServiceTest {
    final UUID user = UUID.randomUUID();
    final LifeCategoryRepository repository = mock(LifeCategoryRepository.class);
    final LifeCategoryService service = new LifeCategoryService(repository, () -> user,
            mock(LifeTimeEntryRepository.class), mock(PlannedTimeBlockRepository.class));
    final LifeCategory root = new LifeCategory(user, "운동", false);
    final LifeCategory other = new LifeCategory(user, "생활", false);
    final LifeCategory child = new LifeCategory(user, "러닝", root.getId(), false);
    void rows(LifeCategory... values) {
        when(repository.findByUserIdOrderBySortOrderAscNameAsc(user)).thenReturn(List.of(values));
    }
    void owned(LifeCategory value) { when(repository.findByIdAndUserId(value.getId(), user)).thenReturn(Optional.of(value)); }
    @Test void createRootAndChildPreservesSemanticIdentityAndAppendsOrder() {
        rows(root, child); owned(root);
        when(repository.save(any())).thenAnswer(i -> i.getArgument(0));
        LifeCategory created = service.create(" 헬스 ", root.getId());
        assertThat(created.getName()).isEqualTo("헬스");
        assertThat(created.getParentId()).isEqualTo(root.getId());
        assertThat(created.getSortOrder()).isEqualTo(1);
        assertThat(service.create("여가", null).getParentId()).isNull();
    }
    @Test void childRequiresOwnedActiveRoot() {
        owned(child);
        assertThatThrownBy(() -> service.create("third level", child.getId())).isInstanceOf(InvalidRequestException.class);
        owned(root); root.deactivate();
        assertThatThrownBy(() -> service.create("inactive", root.getId())).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.create("foreign", UUID.randomUUID())).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void reorderRootsPersistsWithoutChangingChildOrder() {
        rows(root, other, child); child.reorder(7);
        service.reorder(null, List.of(other.getId(), root.getId()));
        assertThat(other.getSortOrder()).isZero(); assertThat(root.getSortOrder()).isEqualTo(1);
        assertThat(child.getSortOrder()).isEqualTo(7);
        verify(repository).saveAll(any());
        assertThat(service.list()).extracting(LifeCategory::getId).contains(root.getId(), child.getId());
    }
    @Test void reorderSiblingsRequiresExactUniqueOwnedSet() {
        LifeCategory second = new LifeCategory(user, "헬스", root.getId(), false);
        rows(root, other, child, second); owned(root);
        service.reorder(root.getId(), List.of(second.getId(), child.getId()));
        assertThat(second.getSortOrder()).isZero(); assertThat(child.getSortOrder()).isEqualTo(1);
        assertThatThrownBy(() -> service.reorder(null, List.of(root.getId(), root.getId()))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.reorder(root.getId(), List.of(child.getId(), other.getId()))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.reorder(root.getId(), List.of(child.getId()))).isInstanceOf(InvalidRequestException.class);
    }
    @Test void renameAndActivationRetainParentAndDeletionProtectsChildren() {
        rows(root, child); owned(root); owned(child);
        when(repository.save(any())).thenAnswer(i -> i.getArgument(0));
        assertThat(service.rename(child.getId(), "조깅").getParentId()).isEqualTo(root.getId());
        assertThat(service.setActive(child.getId(), false).getIsActive()).isFalse();
        assertThat(service.setActive(child.getId(), true).getIsActive()).isTrue();
        assertThatThrownBy(() -> service.delete(root.getId())).isInstanceOf(InvalidRequestException.class);
    }
}
